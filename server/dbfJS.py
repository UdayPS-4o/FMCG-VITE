import sys
import json
import dbfread

def read_dbf(file_path):
    """
    Reads a DBF file and converts it to JSON format.

    :param file_path: Path to the DBF file to be read.
    :return: JSON representation of the DBF file.
    """
    try:
        # Opening the DBF file using dbfread.
        table = dbfread.DBF(file_path, load=True)
        records = [record for record in table]

        # Converting the records to JSON format.
        json_data = json.dumps(records, default=str)
        return json_data
    except Exception as e:
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: dbfReader.py <path_to_dbf_file>")
        sys.exit(1)

    file_path = sys.argv[1]
    print(read_dbf(file_path))